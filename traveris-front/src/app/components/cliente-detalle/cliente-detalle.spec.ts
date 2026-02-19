import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClienteDetalle } from './cliente-detalle';

describe('ClienteDetalle', () => {
  let component: ClienteDetalle;
  let fixture: ComponentFixture<ClienteDetalle>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClienteDetalle]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClienteDetalle);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
