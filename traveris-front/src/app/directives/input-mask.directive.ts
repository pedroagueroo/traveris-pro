import { Directive, HostListener, ElementRef, Input, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

@Directive({
  selector: '[appInputMask]',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => InputMaskDirective),
    multi: true
  }]
})
export class InputMaskDirective implements ControlValueAccessor {
  @Input('appInputMask') maskType: 'dni' | 'tarjeta' | 'vencimiento' = 'dni';

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private el: ElementRef) {}

  writeValue(value: string): void {
    this.el.nativeElement.value = value ? this.applyMask(value) : '';
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  @HostListener('input')
  onInput() {
    const input = this.el.nativeElement as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '');
    const masked = this.applyMask(raw);
    input.value = masked;
    this.onChange(masked);
  }

  @HostListener('blur')
  onBlur() { this.onTouched(); }

  private applyMask(raw: string): string {
    const digits = raw.replace(/[^0-9]/g, '');

    switch (this.maskType) {
      case 'dni': {
        const v = digits.substring(0, 8);
        if (v.length > 5) return v.substring(0, 2) + '.' + v.substring(2, 5) + '.' + v.substring(5);
        if (v.length > 2) return v.substring(0, 2) + '.' + v.substring(2);
        return v;
      }
      case 'tarjeta': {
        const v = digits.substring(0, 16);
        const groups = [];
        for (let i = 0; i < v.length; i += 4) groups.push(v.substring(i, i + 4));
        return groups.join(' ');
      }
      case 'vencimiento': {
        let v = digits.substring(0, 4);
        if (v.length >= 2) {
          let mes = parseInt(v.substring(0, 2));
          if (mes > 12) mes = 12;
          if (mes === 0 && v.length >= 2) mes = 1;
          const mesStr = mes.toString().padStart(2, '0');
          v = mesStr + v.substring(2);
        }
        if (v.length > 2) return v.substring(0, 2) + '/' + v.substring(2);
        return v;
      }
      default: return digits;
    }
  }
}
