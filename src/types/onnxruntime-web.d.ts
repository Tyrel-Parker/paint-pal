// onnxruntime-web's package.json "exports" doesn't expose its types under
// moduleResolution "bundler"; its entire public API is re-exported from
// onnxruntime-common, which types fine.
declare module 'onnxruntime-web' {
  export * from 'onnxruntime-common'
}
