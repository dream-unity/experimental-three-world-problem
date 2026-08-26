(() => {
  'use strict';

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const proto = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype : null;
  const fillStyleDescriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'fillStyle') : null;
  const compositeDescriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'globalCompositeOperation') : null;

  if (!nativeGetContext || !fillStyleDescriptor?.get || !fillStyleDescriptor?.set || !compositeDescriptor?.get || !compositeDescriptor?.set) return;

  HTMLCanvasElement.prototype.getContext = function(type, options) {
    const context = nativeGetContext.call(this, type, options);
    if (!context || type !== '2d' || this.id !== 'world' || context.__dreamUnityLightOverview) return context;

    Object.defineProperty(context, '__dreamUnityLightOverview', { value: true });

    Object.defineProperty(context, 'fillStyle', {
      configurable: true,
      get() { return fillStyleDescriptor.get.call(this); },
      set(value) {
        fillStyleDescriptor.set.call(this, value === '#02040a' ? '#ffffff' : value);
      }
    });

    Object.defineProperty(context, 'globalCompositeOperation', {
      configurable: true,
      get() { return compositeDescriptor.get.call(this); },
      set(value) {
        // Additive light blending is designed for black. On white it erases
        // colour by saturating toward white, so the overview uses normal alpha.
        compositeDescriptor.set.call(this, value === 'lighter' ? 'source-over' : value);
      }
    });

    return context;
  };
})();
