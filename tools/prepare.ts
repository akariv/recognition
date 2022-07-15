import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import { promises } from 'fs';
import * as jpeg from 'jpeg-js';

const canvas = require('canvas');

const faceDetectionNet = faceapi.nets.ssdMobilenetv1;
const modelsPath = '../src/assets/models';
const minConfidence = 0.5;


async function loadImage(path: string): Promise<tf.Tensor4D> {
    const buf = await promises.readFile(path);
    const image = jpeg.decode(buf, {useTArray: true});
    const pixels = image.data;
    const numPixels = image.width * image.height;
    const values = new Int32Array(numPixels * 3);
      
    for (let i = 0; i < numPixels; i++) {
        for (let channel = 0; channel < 3; ++channel) {
            values[i * 3 + channel] = pixels[i * 4 + channel];
        }
    }
      
    const outShape = [image.height, image.width, 3] as [number, number, number];
    const tensor = tf.tensor3d(values, outShape, 'int32');
    const result: tf.Tensor4D = tensor.expandDims(0);
    return result
}


async function run() {
    await faceDetectionNet.loadFromDisk(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
    const faceDetectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence });
    console.log('LOADED');

    const results: any[] = [];

    const directories = (await promises.readdir('./data/', { withFileTypes: true }))
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
    console.log('DIRECTORIES', directories);

    for (const directory of directories) {
        const images = (await promises.readdir(`./data/${directory}/`, { withFileTypes: true }))
                .filter(dirent => dirent.isFile())
                .map(dirent => dirent.name);
        console.log('DIRECTORY', directory);

        for (const image of images) {
            const imageFile: tf.Tensor4D = await loadImage(`./data/${directory}/${image}`);
            console.log('IMAGE FILE', image);
            const resultsRef = await faceapi.detectSingleFace(imageFile, faceDetectionOptions)
                    .withFaceLandmarks()
                    .withFaceDescriptor();
            if (resultsRef) {
                results.push({
                    label: directory,
                    descriptor: Array.from(resultsRef.descriptor),
                });
            }
        }
    }
    
    const data = JSON.stringify(results);
    await promises.writeFile('../src/assets/descriptors.json', data);
}

console.log('STARTING');

run();

console.log('DONE');
