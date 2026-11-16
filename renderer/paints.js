// Paint catalogue for Livery. Codes and names identify real hobby paints so the
// workshop PDF can say what to buy. Screen colours are approximations only:
// check against the maker's colour chart or a painted test card.
// Revell and Zero Paints are listed as brands for "My paints" entries; add the
// exact products you use (brand, code, name, colour) from the catalogue dialog.
'use strict';
(function (root) {
  const tamiyaTS = [
    ['TS-6', 'Matt Black', '#2b2b2b', 'Matte'],
    ['TS-7', 'Racing White', '#f2f0e8', 'Gloss'],
    ['TS-8', 'Italian Red', '#c8102e', 'Gloss'],
    ['TS-13', 'Clear', '#f4f6f8', 'Gloss'],
    ['TS-14', 'Black', '#16181b', 'Gloss'],
    ['TS-15', 'Blue', '#1f4fa3', 'Gloss'],
    ['TS-16', 'Yellow', '#f6c800', 'Gloss'],
    ['TS-17', 'Gloss Aluminium', '#c3c6c9', 'Gloss'],
    ['TS-18', 'Metallic Red', '#9e1b22', 'Gloss'],
    ['TS-19', 'Metallic Blue', '#244c8f', 'Gloss'],
    ['TS-20', 'Metallic Green', '#1f6b45', 'Gloss'],
    ['TS-21', 'Gold', '#c9a548', 'Gloss'],
    ['TS-26', 'Pure White', '#ffffff', 'Gloss'],
    ['TS-29', 'Semi Gloss Black', '#1e1f21', 'Satin'],
    ['TS-30', 'Silver Leaf', '#a9adb1', 'Satin'],
    ['TS-31', 'Bright Orange', '#ee6a1d', 'Gloss'],
    ['TS-36', 'Fluorescent Red', '#ff3b3f', 'Gloss'],
    ['TS-38', 'Gun Metal', '#5a5d61', 'Gloss'],
    ['TS-39', 'Mica Red', '#a3162a', 'Gloss'],
    ['TS-40', 'Metallic Black', '#232528', 'Gloss'],
    ['TS-41', 'Coral Blue', '#1f8fc6', 'Gloss'],
    ['TS-42', 'Light Gun Metal', '#7d8084', 'Gloss'],
    ['TS-43', 'Racing Green', '#1e4a35', 'Gloss'],
    ['TS-44', 'Brilliant Blue', '#2e6fd0', 'Gloss'],
    ['TS-45', 'Pearl White', '#f3f1ea', 'Gloss'],
    ['TS-47', 'Chrome Yellow', '#f4b400', 'Gloss'],
    ['TS-49', 'Bright Red', '#e0211b', 'Gloss'],
    ['TS-50', 'Mica Blue', '#1d3f7a', 'Gloss'],
    ['TS-51', 'Racing Blue', '#3a8fd6', 'Gloss'],
    ['TS-52', 'Candy Lime Green', '#5fb43a', 'Gloss'],
    ['TS-53', 'Deep Metallic Blue', '#1b2f5c', 'Gloss'],
    ['TS-54', 'Light Metallic Blue', '#5f8fc4', 'Gloss'],
    ['TS-55', 'Dark Blue', '#16264d', 'Gloss'],
    ['TS-56', 'Brilliant Orange', '#f2771d', 'Gloss'],
    ['TS-79', 'Semi Gloss Clear', '#f4f6f8', 'Satin'],
    ['TS-80', 'Flat Clear', '#f4f6f8', 'Matte']
  ];
  const tamiyaX = [
    ['X-1', 'Black', '#18191b', 'Gloss'],
    ['X-2', 'White', '#f5f5f2', 'Gloss'],
    ['X-3', 'Royal Blue', '#1d3c8c', 'Gloss'],
    ['X-4', 'Blue', '#1f56a8', 'Gloss'],
    ['X-5', 'Green', '#1f7a3e', 'Gloss'],
    ['X-6', 'Orange', '#ef6c1e', 'Gloss'],
    ['X-7', 'Red', '#c8141f', 'Gloss'],
    ['X-8', 'Lemon Yellow', '#f7d417', 'Gloss'],
    ['X-9', 'Brown', '#5c3a21', 'Gloss'],
    ['X-10', 'Gun Metal', '#55585c', 'Gloss'],
    ['X-11', 'Chrome Silver', '#c6c9cc', 'Gloss'],
    ['X-12', 'Gold Leaf', '#c7a24a', 'Gloss'],
    ['X-13', 'Metallic Blue', '#2a4f8f', 'Gloss'],
    ['X-14', 'Sky Blue', '#5aa6d6', 'Gloss'],
    ['X-15', 'Light Green', '#6fb84a', 'Gloss'],
    ['X-16', 'Purple', '#5b2a7a', 'Gloss'],
    ['X-17', 'Pink', '#f08bb0', 'Gloss'],
    ['X-18', 'Semi Gloss Black', '#1f2022', 'Satin'],
    ['XF-1', 'Flat Black', '#232323', 'Matte'],
    ['XF-2', 'Flat White', '#efefea', 'Matte'],
    ['XF-3', 'Flat Yellow', '#e9c21a', 'Matte'],
    ['XF-7', 'Flat Red', '#b5222b', 'Matte'],
    ['XF-8', 'Flat Blue', '#24447a', 'Matte']
  ];
  const humbrol = [
    ['2', 'Emerald', '#00704a', 'Gloss'],
    ['3', 'Brunswick Green', '#1d4a33', 'Gloss'],
    ['11', 'Silver', '#b9bcbf', 'Gloss'],
    ['14', 'French Blue', '#1f4fa0', 'Gloss'],
    ['15', 'Midnight Blue', '#1a2550', 'Gloss'],
    ['16', 'Gold', '#c2a046', 'Gloss'],
    ['18', 'Orange', '#ee6f1f', 'Gloss'],
    ['19', 'Bright Red', '#c9161f', 'Gloss'],
    ['21', 'Black', '#18191b', 'Gloss'],
    ['22', 'White', '#f4f4f0', 'Gloss'],
    ['33', 'Black', '#252525', 'Matte'],
    ['34', 'White', '#ececea', 'Matte'],
    ['35', 'Gloss Varnish', '#f4f6f8', 'Gloss'],
    ['47', 'Sea Blue', '#24508f', 'Gloss'],
    ['60', 'Scarlet', '#b3262a', 'Matte'],
    ['69', 'Yellow', '#f2c40f', 'Gloss']
  ];
  const entry =
    (brand, range) =>
    ([code, name, hex, finish]) => ({ brand, range, code, name, hex, finish });
  root.PaintCatalogue = {
    BRANDS: ['Tamiya', 'Humbrol', 'Revell', 'Zero Paints'],
    paints: [
      ...tamiyaTS.map(entry('Tamiya', 'TS spray')),
      ...tamiyaX.map(entry('Tamiya', 'X/XF acrylic')),
      ...humbrol.map(entry('Humbrol', 'Enamel'))
    ],
    // "Tamiya TS-8 Italian Red", "Humbrol 19 Bright Red".
    label: p => [p.brand, p.code, p.name].filter(Boolean).join(' ')
  };
})(globalThis);
