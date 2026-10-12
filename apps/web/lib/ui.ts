export function showError(e: unknown) {
  console.error(e);
  const el = document.querySelector('#summary');
  if (el) {
    el.textContent = e instanceof Error ? e.message : 'Veri yüklenemedi';
    el.classList.add('error');
  }
}
