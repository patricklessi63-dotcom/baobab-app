// Dataset de "stickers" — cartes emoji stylisées (1-2 emojis Unicode en
// grand format sur fond dégradé, légende courte parfois). Aucun asset
// externe, aucun risque de droit d'auteur (décision validée avec l'utilisateur).
// Les stickers ne touchent jamais Storage : ils vivent entièrement dans
// messages.media_meta ({ emoji, caption, gradient }).

export const STICKER_GRADIENTS = {
  coral: "linear-gradient(160deg, #E56B5D, #F2B84B)",
  green: "linear-gradient(160deg, #2F8F6B, #7ED9A8)",
  indigo: "linear-gradient(160deg, #151B3D, #5667A9)",
  gold: "linear-gradient(160deg, #F2B84B, #E56B5D)",
  sky: "linear-gradient(160deg, #5667A9, #7FC7FF)",
  sunset: "linear-gradient(160deg, #E56B5D, #151B3D)",
};

export const STICKER_CATEGORIES = [
  {
    id: "expressions",
    label: "Expressions",
    icon: "😊",
    stickers: [
      { id: "exp-1", emoji: "😄", caption: "Trop content !", gradient: "gold" },
      { id: "exp-2", emoji: "😍", caption: "J'adore", gradient: "coral" },
      { id: "exp-3", emoji: "😅", caption: "Oups...", gradient: "sky" },
      { id: "exp-4", emoji: "🤔", caption: "Je réfléchis", gradient: "indigo" },
      { id: "exp-5", emoji: "😴", caption: "Zzz", gradient: "sky" },
      { id: "exp-6", emoji: "😎", caption: "Cool", gradient: "sunset" },
      { id: "exp-7", emoji: "🥺", caption: "S'il te plaît", gradient: "coral" },
      { id: "exp-8", emoji: "😱", caption: "Wow !", gradient: "gold" },
    ],
  },
  {
    id: "love",
    label: "Amour",
    icon: "❤️",
    stickers: [
      { id: "love-1", emoji: "❤️", caption: "Je t'aime", gradient: "coral" },
      { id: "love-2", emoji: "😘", caption: "Bisou", gradient: "sunset" },
      { id: "love-3", emoji: "🥰💕", gradient: "coral" },
      { id: "love-4", emoji: "💑", caption: "Toi et moi", gradient: "sunset" },
      { id: "love-5", emoji: "💘", caption: "Coup de foudre", gradient: "coral" },
      { id: "love-6", emoji: "🌹", caption: "Pour toi", gradient: "sunset" },
      { id: "love-7", emoji: "💞", gradient: "gold" },
    ],
  },
  {
    id: "humor",
    label: "Humour",
    icon: "😂",
    stickers: [
      { id: "hum-1", emoji: "🤣", caption: "Mort de rire", gradient: "gold" },
      { id: "hum-2", emoji: "😂👌", caption: "Trop drôle", gradient: "sky" },
      { id: "hum-3", emoji: "🤪", gradient: "coral" },
      { id: "hum-4", emoji: "😜", caption: "Je plaisante", gradient: "gold" },
      { id: "hum-5", emoji: "🙃", gradient: "sky" },
      { id: "hum-6", emoji: "🤡", caption: "Blague", gradient: "coral" },
    ],
  },
  {
    id: "party",
    label: "Fête",
    icon: "🎉",
    stickers: [
      { id: "party-1", emoji: "🎉", caption: "Félicitations !", gradient: "gold" },
      { id: "party-2", emoji: "🥳", caption: "On fête ça !", gradient: "coral" },
      { id: "party-3", emoji: "🎂🎈", caption: "Joyeux anniversaire", gradient: "sunset" },
      { id: "party-4", emoji: "🥂", caption: "Santé !", gradient: "gold" },
      { id: "party-5", emoji: "🎊", gradient: "coral" },
      { id: "party-6", emoji: "🏆", caption: "Bravo !", gradient: "gold" },
    ],
  },
  {
    id: "greetings",
    label: "Salutations",
    icon: "👋",
    stickers: [
      { id: "greet-1", emoji: "👋", caption: "Salut !", gradient: "sky" },
      { id: "greet-2", emoji: "🙌", caption: "Bienvenue", gradient: "green" },
      { id: "greet-3", emoji: "🤝", caption: "Enchanté(e)", gradient: "indigo" },
      { id: "greet-4", emoji: "😊👋", caption: "Comment vas-tu ?", gradient: "sky" },
      { id: "greet-5", emoji: "🌅", caption: "Bonne journée", gradient: "gold" },
      { id: "greet-6", emoji: "🌙", caption: "Bonne nuit", gradient: "indigo" },
    ],
  },
  {
    id: "canada",
    label: "Canada",
    icon: "🇨🇦",
    stickers: [
      { id: "can-1", emoji: "🇨🇦", caption: "Fier d'être ici", gradient: "sunset" },
      { id: "can-2", emoji: "🍁", caption: "Érable", gradient: "gold" },
      { id: "can-3", emoji: "❄️", caption: "Hiver canadien", gradient: "sky" },
      { id: "can-4", emoji: "🏒", caption: "Hockey", gradient: "indigo" },
      { id: "can-5", emoji: "🏔️", caption: "Nouvelle vie", gradient: "sky" },
      { id: "can-6", emoji: "🛬", caption: "Nouvel arrivant", gradient: "green" },
    ],
  },
  {
    id: "baobab",
    label: "Baobab",
    icon: "🌳",
    stickers: [
      { id: "bao-1", emoji: "🌳", caption: "Baobab", gradient: "green" },
      { id: "bao-2", emoji: "🌍❤️", caption: "Communauté", gradient: "sunset" },
      { id: "bao-3", emoji: "🌱", caption: "Nouveau départ", gradient: "green" },
      { id: "bao-4", emoji: "🤝🌳", caption: "Connexion réelle", gradient: "green" },
      { id: "bao-5", emoji: "✨", caption: "Match !", gradient: "gold" },
      { id: "bao-6", emoji: "🌴", gradient: "green" },
    ],
  },
];
