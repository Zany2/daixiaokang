export default {
  name: '北工大 · 校园漫游',
  // 64×64 PNG, 4px arms, ≤ 18000 bytes. docs/avatar.md
  skin: '',
  languages: ['zh'],
  // weather: { city: '上海', cityEn: 'Shanghai', latitude: 31.23, longitude: 121.47, timezone: 'Asia/Shanghai' },
  weather: null,
  start: { weather: 'clear', time: 'day' },
  dock: [],
  // Empty endpoint uses same-origin WSS in production, localhost:8000 in development.
  multiplayer: { enabled: true, room: 'bjut', endpoint: '' },
  mailbox: { endpoint: '', email: '', turnstileSitekey: '' },
  badge: true,
};
