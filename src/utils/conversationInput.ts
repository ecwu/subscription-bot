export function isCancelInput(text: string): boolean {
  return text.trim() === "/cancel" || text.trim() === "取消";
}
