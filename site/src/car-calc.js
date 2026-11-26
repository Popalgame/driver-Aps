// Машини — чиста логіка без DOM (tests/cars.test.mjs).
// cars/{id} { plate, model, driver: uid|null, driverName, project: pid|null, note, createdAt, updatedAt }

// Поточний кілометраж машини: останній показник, вписаний на цій машині (будь-яким водієм);
// якщо таких ще немає — останній старий показник закріпленого водія (до вибору машин)
export function carKm(entries, car) {
  const odo = entries.filter((e) => e.type === 'odo' && e.car === car.id && typeof e.km === 'number').sort((a, b) => b.at - a.at);
  if (odo[0]) return { km: odo[0].km, at: odo[0].at, uid: odo[0].uid };
  return car.driver ? lastKm(entries.filter((e) => !e.car), car.driver) : null;
}

// Останній показник одометра водія
export function lastKm(entries, uid) {
  const odo = entries.filter((e) => e.type === 'odo' && e.uid === uid && typeof e.km === 'number').sort((a, b) => b.at - a.at);
  return odo[0] ? { km: odo[0].km, at: odo[0].at } : null;
}


// Машина водія: на якій він сьогодні (вписав кілометраж), інакше остання, на якій їздив,
// інакше закріплена керівником. how: 'today' | 'last' | 'assigned'
export function driverCar(cars, entries, uid, now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const odo = entries.filter((e) => e.type === 'odo' && e.uid === uid && e.car && cars.some((c) => c.id === e.car))
    .sort((a, b) => b.at - a.at);
  if (odo[0]) return { car: cars.find((c) => c.id === odo[0].car), how: odo[0].at >= +d ? 'today' : 'last', at: odo[0].at };
  // закріплена керівником, інакше своя машина працівника
  const a = cars.find((c) => c.driver === uid) || cars.find((c) => c.personal && c.id === 'own_' + uid);
  return a ? { car: a, how: 'assigned' } : null;
}
