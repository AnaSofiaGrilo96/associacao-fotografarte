import { Component, inject } from '@angular/core';
import { ThemeService } from './core/theme.service';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  private readonly theme = inject(ThemeService);
}
