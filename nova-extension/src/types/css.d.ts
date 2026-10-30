/** 构建时把 .css 当文本导入（已过 Tailwind），用于注入 Shadow DOM */
declare module "*.css" {
  const content: string
  export default content
}
