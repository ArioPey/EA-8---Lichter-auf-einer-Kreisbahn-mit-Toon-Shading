# Lichter auf einer Kreisbahn mit Toon Shading

## Bedienung
- **L/l**: Beide Punktlichter in 15°-Schritten auf einer Kreisbahn bewegen.
- **T**: Toon-/Cel-Shading an- oder ausschalten.

## Umsetzung
Mehrere farbige 3D-Modelle werden von zwei Punktlichtern beleuchtet. Die Lichtpositionen werden in Weltkoordinaten berechnet und sind unabhängig von der Kamera. Der Fragment-Shader berechnet diffuse und spekulare Beleuchtung. Der Toon-Modus quantisiert die diffuse Beleuchtung in Stufen und erzeugt gestufte Glanzlichter.

## Quellen
- https://en.wikipedia.org/wiki/Cel_shading
- https://en.wikibooks.org/wiki/GLSL_Programming/Unity/Toon_Shading
- https://webglsamples.org/toon-shading/toon-shading.html

## QA
Für Chrome unter macOS vorgesehen. Bei Fehlern Entwicklerkonsole auf Shader- und WebGL-Meldungen prüfen.
