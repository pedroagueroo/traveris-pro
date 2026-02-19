import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReservasLista } from './reservas-lista';

describe('ReservasLista', () => {
  let component: ReservasLista;
  let fixture: ComponentFixture<ReservasLista>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservasLista]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReservasLista);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
