// ── Retro Ice · Save System ──────────────────────────────
// All saves keyed under "retroice_slot_N"

const SAVE_VERSION = 1;
const NUM_SLOTS = 3;

const SaveSystem = (() => {

  function key(slot) { return `retroice_slot_${slot}`; }

  function load(slot) {
    try {
      const raw = localStorage.getItem(key(slot));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) return null;
      return data;
    } catch(e) { return null; }
  }

  function save(slot, data) {
    try {
      data.version = SAVE_VERSION;
      data.savedAt  = Date.now();
      localStorage.setItem(key(slot), JSON.stringify(data));
      return true;
    } catch(e) { return false; }
  }

  function del(slot) {
    localStorage.removeItem(key(slot));
  }

  function allSlots() {
    const result = [];
    for (let i = 1; i <= NUM_SLOTS; i++) {
      result.push({ slot: i, data: load(i) });
    }
    return result;
  }

  function newSave(slot, skater) {
    // skater: { firstName, lastName, nation, gender, skin, hair }
    const data = {
      slot,
      skater,
      season:  1,
      score:   0,
      medals:  { gold:0, silver:0, bronze:0 },
      events:  [],
      rank:    999,
    };
    save(slot, data);
    return data;
  }

  function updateScore(slot, pts) {
    const d = load(slot);
    if (!d) return;
    d.score += pts;
    save(slot, d);
  }

  function addMedal(slot, type) {
    const d = load(slot);
    if (!d) return;
    d.medals[type] = (d.medals[type]||0) + 1;
    save(slot, d);
  }

  return { load, save, del, allSlots, newSave, updateScore, addMedal, NUM_SLOTS };
})();

// expose globally
window.SaveSystem = SaveSystem;
