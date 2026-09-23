/// <reference types="vite/client" />

declare module '@entrypoints/*.css?inline' {
  const content: string;
  export default content;
}

declare module '@/entrypoints/*.css?inline' {
  const content: string;
  export default content;
}

declare module '@/*.css?inline' {
  const content: string;
  export default content;
}

declare module '@frontend/*' {
  const content: any;
  export default content;
}

declare module '@entrypoints/*' {
  const content: any;
  export default content;
}

declare module '@/*' {
  const content: any;
  export default content;
}
