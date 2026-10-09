/** 마우스 커서를 따라다니는 비용/상태 툴팁 */
export class Tooltip {
  private readonly el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'tooltip';
    root.appendChild(this.el);
  }

  show(text: string, x: number, y: number, ok: boolean): void {
    if (!text) {
      this.hide();
      return;
    }
    this.el.textContent = text;
    this.el.classList.toggle('bad', !ok);
    this.el.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 16)}px)`;
    this.el.classList.add('show');
  }

  hide(): void {
    this.el.classList.remove('show');
  }
}
