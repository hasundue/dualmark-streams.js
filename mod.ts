export type DualMarkStreamWatermarks = {
  high: number;
  low?: number;
};

export type DualMarkStreamUnderlyingSource<R extends unknown> = {
  start: (
    controller: DualMarkReadableStreamController<R>,
  ) => void | Promise<void>;
  stop?: (
    controller: DualMarkReadableStreamController<R>,
  ) => void | Promise<void>;
  restart?: (
    contoller: TransformStreamDefaultController<R>,
  ) => void | Promise<void>;
  cancel?: UnderlyingSource<R>["cancel"];
};

export function createDualMarkReadableStream<R extends unknown>(
  source: DualMarkStreamUnderlyingSource<R>,
  marks: DualMarkStreamWatermarks,
): ReadableStream<R> {
  const { high, low } = { low: Math.floor(marks.high / 2), ...marks };

  const readable = new ReadableStream<R>({
    start(controller) {
      return source.start?.(
        new DualMarkReadableStreamController<R>(controller, source.stop),
      );
    },
    cancel: source.cancel,
  }, new CountQueuingStrategy({ highWaterMark: high }));

  const buffer = new TransformStream<R, R>({
    flush(controller) {
      return source.restart?.(controller);
    },
  }, new CountQueuingStrategy({ highWaterMark: high - low }));

  readable.pipeTo(buffer.writable);

  return buffer.readable;
}

class DualMarkReadableStreamController<R extends unknown>
  implements ReadableStreamDefaultController<R> {
  close: ReadableStreamDefaultController["close"];
  error: ReadableStreamDefaultController["error"];

  constructor(
    protected controller: ReadableStreamDefaultController<R>,
    protected stop: DualMarkStreamUnderlyingSource<R>["stop"],
  ) {
    this.close = controller.close.bind(controller);
    this.error = controller.error.bind(controller);
  }

  get desiredSize() {
    return this.controller.desiredSize;
  }

  enqueue(chunk: R) {
    this.controller.enqueue(chunk);

    if (this.desiredSize && this.desiredSize <= 0) {
      return this.stop?.(this);
    }
  }
}
