export type GalleryImage = {
  id: string;
  title: string;
  category: string;
  url: string;
  description?: string;
};

// Галерея починається порожньою. Зображення додаються з Asset Manager або з файлів.
export const catalog: GalleryImage[] = [];
