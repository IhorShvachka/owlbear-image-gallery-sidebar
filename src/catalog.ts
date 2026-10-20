export type GalleryImage = {
  id: string;
  title: string;
  category: string;
  url: string;
  description?: string;
};

// Замінюй приклади на власні HTTPS-посилання.
// Посилання має відкриватися в браузері кожного учасника.
export const catalog: GalleryImage[] = [
  {
    id: "mysterious-stranger",
    title: "Таємничий незнайомець",
    category: "NPC",
    url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1400&q=85",
    description: "Портрет таємничого персонажа"
  },
  {
    id: "ancient-relic",
    title: "Стародавній артефакт",
    category: "Предмети",
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1400&q=85",
    description: "Знахідка з давніх руїн"
  },
  {
    id: "old-map",
    title: "Стара карта",
    category: "Документи",
    url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1400&q=85",
    description: "Карта для сюжетної сцени"
  },
  {
    id: "dark-forest",
    title: "Темний ліс",
    category: "Локації",
    url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=85",
    description: "Похмура лісова місцевість"
  },
  {
    id: "stormy-sea",
    title: "Бурхливе море",
    category: "Локації",
    url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1400&q=85",
    description: "Море перед штормом"
  },
  {
    id: "ancient-door",
    title: "Двері храму",
    category: "Об'єкти",
    url: "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?auto=format&fit=crop&w=1400&q=85",
    description: "Вхід до стародавнього храму"
  }
];
