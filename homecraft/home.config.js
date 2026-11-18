export default {
  name: '北工大 · 校园漫游',
  // 64×64 PNG, 4px arms, ≤ 18000 bytes. docs/avatar.md
  skin: '',
  languages: ['zh'],
  // weather: { city: '上海', cityEn: 'Shanghai', latitude: 31.23, longitude: 121.47, timezone: 'Asia/Shanghai' },
  weather: null,
  start: { weather: 'clear', time: 'day' },
  dock: ['overview', 'south-gate', 'library', 'north-ground', 'olympic', 'student-9'],
  mailbox: { endpoint: '', email: '', turnstileSitekey: '' },
  badge: true,
};
