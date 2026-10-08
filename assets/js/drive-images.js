/*
  CREATIONS BY ROMA APUYAN — Google Drive image settings
  To add or change photographs, paste the Google Drive file URL or file ID in the quoted field.
  Empty fields use the original website image (or no image in the case of service banners).
  Only public images with "Anyone with the link" Viewer sharing can display here.
*/
(() => {
  'use strict';

  const images = {
    // Homepage photography
    hero_primary: '1MfKQ97Ungl5ssS7N4_RyLz-w9wb-UxIU',
    hero_secondary: '',

    // Existing six-photo gallery
    gallery_1: '1MfKQ97Ungl5ssS7N4_RyLz-w9wb-UxIU',
    gallery_2: '',
    gallery_3: '',
    gallery_4: '',
    gallery_5: '',
    gallery_6: '',

    // Service-card photography, when photos are provided
    service_portraits: '',
    service_events: '',
    service_films: '',
    service_editorial: ''
  };

  function driveId(value) {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    let m = v.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (!m) m = v.match(/[?&]id=([A-Za-z0-9_-]+)/);
    const id = m ? m[1] : v;
    return /^[A-Za-z0-9_-]{15,}$/.test(id) ? id : '';
  }

  function useDriveImage(img) {
    const slot = img.getAttribute('data-drive-slot');
    const id = driveId(images[slot] || '');
    if (!id) return;

    const service = img.classList.contains('service-drive-image');
    const originalSrc = img.getAttribute('src');
    const parentGallery = img.closest('.gallery-item');
    let successful = false;
    let requestedDrive = true;

    img.addEventListener('load', () => {
      if (!requestedDrive || !img.naturalWidth) return;
      successful = true;
      if (service) img.hidden = false;
      if (!parentGallery) {
        img.alt = 'Photo from the Creations by Roma Apuyan Google Drive collection';
        return;
      }
      const index = Number(slot.split('_')[1]);
      const label = parentGallery.querySelector('.photo-label span');
      const title = parentGallery.querySelector('.photo-label strong');
      if (label) label.textContent = String(index).padStart(2, '0') + ' · Gallery';
      if (title) title.textContent = 'Our photo collection';
      parentGallery.dataset.title = 'Our photo collection';
      parentGallery.dataset.source = 'google-drive';
      parentGallery.setAttribute('aria-label', 'View photograph from our Google Drive collection');
      img.alt = 'Photo from the Creations by Roma Apuyan Google Drive collection';
    });

    img.addEventListener('error', () => {
      if (!requestedDrive || successful) return;
      requestedDrive = false;
      if (service) {
        img.hidden = true;
        img.removeAttribute('src');
      } else if (originalSrc) {
        img.setAttribute('src', originalSrc);
      }
    });

    img.setAttribute('src', 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600');
  }

  document.querySelectorAll('img[data-drive-slot]').forEach(useDriveImage);
})();
