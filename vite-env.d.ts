/// <reference types="vite/client" />

// Type declarations for @frontend and @ aliases with CSS imports
declare module '@frontend/*.css?inline' {
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

declare module '@/*' {
  const content: any;
  export default content;
}
