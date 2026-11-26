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

