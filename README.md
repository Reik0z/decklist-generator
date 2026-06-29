# Decklist Generator — Unleashed Open

Genera imágenes de decklists de **Riftbound** automáticamente a partir de listas de texto. Diseñado para el torneo **Unleashed Open** de la comunidad Riftbound Chile.

## Requisitos

- [Node.js](https://nodejs.org/) v18 o superior
- PowerShell 7+ (para el script de descarga de imágenes)

## Instalación

```bash
git clone https://github.com/Reik0z/decklist-generator.git
cd decklist-generator
npm install
```

Luego descarga las imágenes de cartas (~900 MB):

```powershell
.\download_missing.ps1
```

## Uso

1. Crea un archivo `.txt` por jugador dentro de la carpeta `input/` — el nombre del archivo será el nombre del jugador en la imagen.

2. Usa el siguiente formato de lista:

```
Legend: 1 LeBlanc, Deceiver
Champion: 1 LeBlanc, Fragmented
MainDeck: 3 Vi, Peacekeeper
3 Karthus, Eternal
3 Ruined Rex
3 Black Rose Dignitary
3 Rift Herald
3 Soaring Scout
3 Watchful Sentry
3 Glasc Mixologist
3 Mirror Image
2 Hidden Blade
3 Sacrifice
3 Baited Hook
3 Harnessed Dragon
Battlefields: 1 Star Spring
1 Aspirant's Climb
1 Windswept Hillock
Rune Pool: 4 Mind Rune
8 Order Rune
Sideboard: 1 LeBlanc, Everywhere at Once
2 Thousand-Tailed Watcher
2 Ashe, Focused
2 Salvage
1 Dr. Mundo, Expert
```

3. Ejecuta el generador:

```bash
node generate.js
```

Las imágenes PNG se guardan en la carpeta `output/`.

## Personalización

El diseño visual se controla desde `template.html`. Las variables CSS al inicio del archivo permiten cambiar colores, tamaños y fuentes sin tocar la lógica:

```css
:root {
  --gold:       #C4982A;
  --red:        #C01818;
  --card-w:     150px;
  --card-h:     209px;
  /* ... */
}
```

