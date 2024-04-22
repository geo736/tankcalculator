const tankShapeSelect = document.getElementById('tank-shape');
const inputUnitSelect = document.getElementById('input-unit');
const outputUnitSelect = document.getElementById('output-unit');
const radiusInput = document.getElementById('radius');
const heightInput = document.getElementById('height');
const lengthInput = document.getElementById('length');
const widthInput = document.getElementById('width');
const calculateButton = document.getElementById('calculate');
const resultParagraph = document.getElementById('result');

calculateButton.addEventListener('click', calculateVolume);

function calculateVolume() {
    const tankShape = tankShapeSelect.value;
    const inputUnit = inputUnitSelect.value;
    const outputUnit = outputUnitSelect.value;
    const radius = parseFloat(radiusInput.value);
    const height = parseFloat(heightInput.value);
    const length = parseFloat(lengthInput.value);
    const width = parseFloat(widthInput.value);
    let volume;

    switch (tankShape) {
        case 'cylinder':
            volume = Math.PI * Math.pow(radius, 2) * height;
            break;
        case 'rectangular':
            volume = length * width * height;
            break;
        case 'cone':
            volume = (1/3) * Math.PI * Math.pow(radius, 2) * height;
            break;
    }

    // Convert input units to meters
    switch (inputUnit) {
        case 'feet':
            radius /= 3.2808;
            height /= 3.2808;
            length /= 3.2808;
            width /= 3.2808;
            break;
        case 'inches':
            radius /= 39.3701;
            height /= 39.3701;
            length /= 39.3701;
            width /= 39.3701;
            break;
    }