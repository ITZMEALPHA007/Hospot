import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MedicineProductImage, { PLACEHOLDER_IMAGE } from './MedicineProductImage';

describe('medicine detail product image', () => {
  test('uses the medicine image and alt metadata without cropping', () => {
    const medicine = {
      name: 'Sample medicine',
      imageUrl: 'https://example.org/product.png',
      imageAlt: 'Sample package, 10 tablets',
    };

    const html = renderToStaticMarkup(<MedicineProductImage medicine={medicine} />);

    expect(html).toContain('src="https://example.org/product.png"');
    expect(html).toContain('alt="Sample package, 10 tablets"');
    expect(html).toContain('object-contain');
  });

  test('uses the neutral placeholder when product image metadata is unavailable', () => {
    const html = renderToStaticMarkup(
      <MedicineProductImage medicine={{ name: 'Sample medicine', imageUrl: null }} />
    );

    expect(html).toContain(`src="${PLACEHOLDER_IMAGE}"`);
    expect(html).toContain('alt="Product image unavailable for Sample medicine"');
  });

  test('falls back to the placeholder when a product image fails to load', () => {
    const element = MedicineProductImage({
      medicine: { name: 'Sample medicine', imageUrl: 'https://example.org/missing.png' },
    });
    const image = element.props.children;
    const currentTarget = { src: image.props.src, onerror: () => {} };

    image.props.onError({ currentTarget });

    expect(currentTarget.src).toBe(PLACEHOLDER_IMAGE);
    expect(currentTarget.onerror).toBeNull();
  });
});
