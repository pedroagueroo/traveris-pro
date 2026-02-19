import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReservaNueva } from './reserva-nueva';

describe('ReservaNueva', () => {
  let component: ReservaNueva;
  let fixture: ComponentFixture<ReservaNueva>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservaNueva]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReservaNueva);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
