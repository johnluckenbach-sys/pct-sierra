const CLOUD = 'dmpvggpzz';
const BASE   = `https://res.cloudinary.com/${CLOUD}/image/upload`;

export function cdnUrl(publicId: string, transforms = 'f_auto,q_auto') {
  return `${BASE}/${transforms}/${publicId}`;
}

// 4:3 thumbnail for grid display
export function cdnThumb(publicId: string, width = 800) {
  return cdnUrl(publicId, `f_auto,q_auto,w_${width},c_fill,ar_4:3`);
}

// Full-size for lightbox
export function cdnFull(publicId: string) {
  return cdnUrl(publicId, 'f_auto,q_auto');
}
