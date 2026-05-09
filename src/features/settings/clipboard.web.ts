export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  return true;
}

export async function readText() {
  return navigator.clipboard.readText();
}