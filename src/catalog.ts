export type GalleryImage = {
  id: string;
  title: string;
  url: string;
  description?: string;
  folder?: string;
  /** Legacy field retained only for compatibility with older room metadata. */
  category?: string;
};

// Галерея починається порожньою. Зображення додаються з Asset Manager або з файлів.
export const catalog: GalleryImage[] = [];
