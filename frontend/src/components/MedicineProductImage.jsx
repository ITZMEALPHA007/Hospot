import React from 'react';

const PLACEHOLDER_IMAGE = '/images/medicine-placeholder.svg';

const MedicineProductImage = ({ medicine }) => {
  const hasProductImage = Boolean(medicine.imageUrl);

  return (
    <div className="aspect-square bg-white rounded-lg p-8 shadow-sm">
      <img
        src={medicine.imageUrl || PLACEHOLDER_IMAGE}
        alt={hasProductImage
          ? (medicine.imageAlt || `${medicine.name} packaging`)
          : `Product image unavailable for ${medicine.name}`}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = PLACEHOLDER_IMAGE;
        }}
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export { PLACEHOLDER_IMAGE };
export default MedicineProductImage;
