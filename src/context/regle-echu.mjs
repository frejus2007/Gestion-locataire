export function periodeMois(ref) {
  const d = ref instanceof Date ? ref : new Date(ref);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function estEchuPour(loyer, bail, ref = new Date()) {
  // Sans bail, la période fait foi : elle est au format « AAAA-MM ».
  if (!bail) return (loyer.periode || "") <= periodeMois(ref);
  // Le jour d'échéance vient du bail ; il est modifiable car certains baux
  // portent le 5 ou le 10 plutôt que le 1er. Un bail sans jour lisible
  // retombe sur le 1er, qui est la règle usuelle.
  const jour = Number(bail.echeanceJour) || 1;
  return periodeMois(ref) > loyer.periode
    || (periodeMois(ref) === loyer.periode && ref.getDate() >= jour);
}