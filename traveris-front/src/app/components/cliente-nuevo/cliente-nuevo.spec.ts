import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClienteNuevo } from './cliente-nuevo';

describe('ClienteNuevo', () => {
  let component: ClienteNuevo;
  let fixture: ComponentFixture<ClienteNuevo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClienteNuevo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClienteNuevo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
