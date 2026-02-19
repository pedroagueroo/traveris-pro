import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientesListaComponent } from './clientes-lista';

describe('ClientesLista', () => {
  let component: ClientesListaComponent;
  let fixture: ComponentFixture<ClientesListaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientesListaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClientesListaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
