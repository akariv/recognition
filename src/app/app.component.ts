import { Component, ElementRef, ViewChild } from '@angular/core';
import { defer, tap, fromEvent, ReplaySubject, switchMap } from 'rxjs';
import * as faceapi from 'face-api.js';
import { Point } from 'face-api.js';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less']
})
export class AppComponent {

  @ViewChild('inputVideo') inputVideo: ElementRef;
  @ViewChild('overlay') overlay: ElementRef;

  descriptors = new ReplaySubject<Array<faceapi.LabeledFaceDescriptors>>();
  videoStream: MediaStream;
  matcher: faceapi.FaceMatcher | null = null;

  constructor(private http: HttpClient) {
    http.get('assets/descriptors.json').subscribe((descriptors: any) => {
      const mapping: any = {};
      descriptors.forEach((descriptor: any) => {
        const label = descriptor.label;
        if (!mapping[label]) {
          mapping[label] = [];
          mapping[label].push(Float32Array.from(descriptor.descriptor));
        }
      });
      this.descriptors.next(Object.keys(mapping).map((label: any) => {
        return new faceapi.LabeledFaceDescriptors(label, mapping[label]);
      }));
      this.descriptors.complete();
    });
  }

  async loadModels() {
    await faceapi.loadFaceDetectionModel('assets/models');
    await faceapi.loadFaceLandmarkModel('assets/models');  
    await faceapi.loadFaceRecognitionModel('assets/models');
    await faceapi.loadAgeGenderModel('assets/models');
  }
  
  ngAfterViewInit(): void {
    defer(async () => this.init()).subscribe(() => {
      console.log('initialized');
    });
  }

  async init() {
    const videoEl: HTMLVideoElement = this.inputVideo.nativeElement;
    const overlayEl: HTMLCanvasElement = this.overlay.nativeElement;

    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    console.log('SUPPORTED', JSON.stringify(supportedConstraints));
    const videoConstraints: any = {};
    if (supportedConstraints.facingMode) { videoConstraints.facingMode = {exact: 'environment'}; }
    console.log('CONSTRAINTS', JSON.stringify(supportedConstraints));
    try {
      this.videoStream = await navigator.mediaDevices
        .getUserMedia({
          video: videoConstraints,
        });
    } catch (e) {
      this.videoStream = await navigator.mediaDevices
        .getUserMedia({
          video: {},
        });
    }
    console.log('STREAM SIZE', this.videoStream.getVideoTracks()[0].getSettings().width, this.videoStream.getVideoTracks()[0].getSettings().height);

    videoEl.srcObject = this.videoStream;

    fromEvent(videoEl, 'play').pipe(
      tap(() => {
        console.log('SETTING SIZE', videoEl.offsetWidth, videoEl.offsetHeight);
        overlayEl.width = videoEl.clientWidth;
        overlayEl.height = videoEl.clientHeight;    
      }),
      switchMap(() => {
        return defer(async () => await this.loadModels());
      }),
    ).subscribe(() => {
      this.faceDetect();
    });

    this.descriptors.subscribe((descriptors) => {
      this.matcher = new faceapi.FaceMatcher(descriptors);
    });
  }

  faceDetect() {
    const videoEl: HTMLVideoElement = this.inputVideo.nativeElement;
    const overlayEl: HTMLCanvasElement = this.overlay.nativeElement;

    const minConfidence = 0.5;
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence });

    defer(async () => await faceapi.detectAllFaces(videoEl, options).withFaceLandmarks().withAgeAndGender().withFaceDescriptors()).pipe(
    ).subscribe((results) => {
      if (results.length > 0) {
        const dims = faceapi.matchDimensions(overlayEl, videoEl, true);
        const resizedResults = faceapi.resizeResults(results, dims);
        faceapi.draw.drawFaceLandmarks(overlayEl, resizedResults as any);  

        for (const result of resizedResults) {
          const { age, gender } = result as any;

          const text: string[] = [];
          if (this.matcher) {
            const bestMatch = this.matcher.findBestMatch(result.descriptor);
            text.push(bestMatch.label);
          }
          text.push(`${gender}, ~${faceapi.utils.round(age, 0)} years`);
          new faceapi.draw.DrawTextField(text,
            result.detection.box.bottomLeft.add(result.detection.box.bottomRight).div(new Point(2,2))
          ).draw(overlayEl);

        }
      } else {
        const context = overlayEl.getContext('2d');
        context?.clearRect(0, 0, overlayEl.width, overlayEl.height);
      }
      requestAnimationFrame(() => this.faceDetect());
    });
    
  }
}
