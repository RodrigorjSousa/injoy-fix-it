// Reconhecimento facial no próprio aparelho (navegador), com @vladmandic/face-api.
// O celular só calcula o "vetor do rosto" (128 números) e manda para o servidor,
// que faz a comparação com o cadastro. Nenhuma foto é usada para reconhecer.
//
// Importante: a biblioteca é carregada sob demanda (import dinâmico) para não
// pesar nas outras telas e para nunca rodar no servidor (SSR).

type FaceApi = typeof import("@vladmandic/face-api/dist/face-api.esm.js");

const MODEL_URL = "/models/face";
let loading: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import("@vladmandic/face-api/dist/face-api.esm.js");
      // A tipagem do tfjs embutido não expõe setBackend/ready, mas existem em tempo de execução.
      const tf = faceapi.tf as unknown as {
        setBackend: (b: string) => Promise<boolean>;
        ready: () => Promise<void>;
      };
      try {
        if (!(await tf.setBackend("webgl"))) await tf.setBackend("cpu");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export type Point = { x: number; y: number };
export type FaceReading = {
  descriptor: number[];
  score: number;
  ear: number; // abertura média dos olhos (eye aspect ratio)
  box: { x: number; y: number; width: number; height: number };
  centered: boolean;
};

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye Aspect Ratio: cai perto de zero quando o olho fecha. */
export function eyeAspectRatio(eye: Point[]): number {
  if (eye.length < 6) return 0;
  const [p1, p2, p3, p4, p5, p6] = eye;
  const horizontal = dist(p1, p4);
  if (!horizontal) return 0;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horizontal);
}

export async function readFace(video: HTMLVideoElement): Promise<FaceReading | null> {
  const faceapi = await loadFaceApi();
  if (!video.videoWidth) return null;
  const result = await faceapi
    .detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  const box = result.detection.box;
  const ear =
    (eyeAspectRatio(result.landmarks.getLeftEye()) +
      eyeAspectRatio(result.landmarks.getRightEye())) /
    2;
  const cx = (box.x + box.width / 2) / video.videoWidth;
  const cy = (box.y + box.height / 2) / video.videoHeight;
  const big = box.width / video.videoWidth > 0.22;
  return {
    descriptor: Array.from(result.descriptor),
    score: result.detection.score,
    ear,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    centered: big && cx > 0.25 && cx < 0.75 && cy > 0.2 && cy < 0.8,
  };
}

/** Detector de piscada: precisa ver o olho aberto, fechar e abrir de novo. */
export class BlinkDetector {
  private openBaseline = 0;
  private closed = false;
  blinked = false;

  push(ear: number) {
    if (this.blinked || !ear) return this.blinked;
    // Linha de base = olho aberto (média móvel dos valores altos)
    if (!this.closed && ear > this.openBaseline * 0.9) {
      this.openBaseline = this.openBaseline ? this.openBaseline * 0.8 + ear * 0.2 : ear;
    }
    if (this.openBaseline < 0.18) return false; // ainda calibrando
    if (!this.closed && ear < this.openBaseline * 0.7) this.closed = true;
    else if (this.closed && ear > this.openBaseline * 0.88) this.blinked = true;
    return this.blinked;
  }
}

export function averageDescriptor(samples: number[][]): number[] {
  const out = new Array<number>(128).fill(0);
  for (const s of samples) for (let i = 0; i < 128; i++) out[i] += s[i] / samples.length;
  return out.map((v) => Math.round(v * 1e5) / 1e5);
}

export function euclidean(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export async function captureSelfie(video: HTMLVideoElement, width = 480): Promise<Blob | null> {
  if (!video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // mesma orientação que a pessoa vê (espelhado)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.72));
}

const DEVICE_KEY = "injoy:ponto-device-id";
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "sem-armazenamento";
  }
}

export type Position = { latitude: number; longitude: number; accuracy: number } | null;
export function getPosition(timeoutMs = 15000): Promise<Position> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
