# coffeeless

Web integration para la pantalla LCD de los NZXT Kraken (diseñada para el Kraken Plus, 240×240) dentro de NZXT CAM.
Sin build, sin servidor y sin analítica: HTML, CSS y JavaScript servidos por GitHub Pages.

## Qué hace

- Render **cuadrado completo**: no recorta a círculo. La guía circular del editor solo sirve de referencia.
- Fondo: color, URL (GIF, imagen, MP4/WebM) o archivo de tu PC, con escala, rotación, desplazamiento y opacidad.
- Capas: **sensores**, **textos** y **formas** (rectángulos con esquinas redondeadas, relleno y borde, para tapar partes del GIF).
- Cualquier fuente de [Google Fonts](https://fonts.google.com/), más tamaño, grosor, color, espaciado, contorno y sombra.
- Sensores: temperatura, uso, frecuencia y consumo de CPU y GPU; temperatura del líquido; memoria usada, libre y total; hora y fecha. Cada uno con su formato (`53°C`, `53.0°`, `53`, `37%`, `%37`, `13846 MB`, `13.5 GB`…), más texto antes y después del valor.
- Varios presets, exportar e importar como `.json` (el archivo de fondo subido viaja dentro del export).

## Uso en CAM

1. CAM → **Lighting** → modo **Web Integration** → **Custom** → **Edit**.
2. URL: `https://solorzajc.github.io/coffeeless/`
3. La ventana de configuración muestra el editor; la pantalla del Kraken muestra el preset activo y se actualiza sola al guardar.

Fuera de CAM el editor funciona igual, con datos de demostración.

## Notas

- Pinterest: pega la dirección del archivo (`i.pinimg.com/...gif` o `v1.pinimg.com/...mp4`), no la del pin. Los enlaces `.m3u8` de Pinterest se intentan convertir a su versión MP4.
- Los presets viven en el almacenamiento del navegador de CAM. Exporta un respaldo de vez en cuando.
- Los diseños usan un lienzo lógico de 240×240 que se escala a la resolución que reporta CAM.

## Licencia

MIT. Proyecto independiente, sin afiliación con NZXT.
