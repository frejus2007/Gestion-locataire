// Données de démonstration — remplacées par des appels API REST plus tard

export const owner = {
  nom: "KOUASSI",
  prenoms: "Jean-Marc",
  telephone: "+229 97 00 00 00",
  adresse: "Cotonou, Bénin",
  ifu: "0000000000000",
  signatureImage: null, // URL ou null → espace signature manuelle
};

export const tenants = [
  {
    id: 1,
    nom: "ADJOVI",
    prenoms: "Marie",
    telephone: "+229 96 11 22 33",
    ifu: "202400000001",
    pieceNumero: "CNI001234",
    pieceNature: "CNI",
    dateEntree: "2025-01-01",
    dateSortie: null,
    loyerMensuel: 50000,
    codeAcces: "123456",
  },
  {
    id: 2,
    nom: "HOUNNOU",
    prenoms: "Kofi",
    telephone: "+229 95 44 55 66",
    ifu: "202400000002",
    pieceNumero: "PAS987654",
    pieceNature: "Passeport",
    dateEntree: "2025-03-01",
    dateSortie: null,
    loyerMensuel: 75000,
    codeAcces: "654321",
  },
  {
    id: 3,
    nom: "SEGLA",
    prenoms: "Awa",
    telephone: "+229 97 77 88 99",
    ifu: "202400000003",
    pieceNumero: "CNI005678",
    pieceNature: "CNI",
    dateEntree: "2024-06-01",
    dateSortie: null,
    loyerMensuel: 60000,
    codeAcces: "111222",
  },
];

// Paiements : { id, tenantId, date, periode, montantDu, montantPaye }
export const payments = [
  { id: 1, tenantId: 1, date: "2025-01-05", periode: "Janvier 2025", montantDu: 50000, montantPaye: 50000 },
  { id: 2, tenantId: 1, date: "2025-02-05", periode: "Février 2025", montantDu: 50000, montantPaye: 50000 },
  { id: 3, tenantId: 1, date: "2025-03-05", periode: "Mars 2025", montantDu: 50000, montantPaye: 30000 },
  { id: 4, tenantId: 1, date: "2025-04-05", periode: "Avril 2025", montantDu: 50000, montantPaye: 50000 },
  { id: 5, tenantId: 1, date: "2025-05-05", periode: "Mai 2025", montantDu: 50000, montantPaye: 50000 },
  { id: 6, tenantId: 1, date: "2025-06-05", periode: "Juin 2025", montantDu: 50000, montantPaye: 20000 },

  { id: 7, tenantId: 2, date: "2025-03-05", periode: "Mars 2025", montantDu: 75000, montantPaye: 75000 },
  { id: 8, tenantId: 2, date: "2025-04-05", periode: "Avril 2025", montantDu: 75000, montantPaye: 75000 },
  { id: 9, tenantId: 2, date: "2025-05-05", periode: "Mai 2025", montantDu: 75000, montantPaye: 50000 },

  { id: 10, tenantId: 3, date: "2024-06-05", periode: "Juin 2024", montantDu: 60000, montantPaye: 60000 },
  { id: 11, tenantId: 3, date: "2024-07-05", periode: "Juillet 2024", montantDu: 60000, montantPaye: 60000 },
  { id: 12, tenantId: 3, date: "2024-08-05", periode: "Août 2024", montantDu: 60000, montantPaye: 40000 },
  { id: 13, tenantId: 3, date: "2024-09-05", periode: "Septembre 2024", montantDu: 60000, montantPaye: 60000 },
  { id: 14, tenantId: 3, date: "2024-10-05", periode: "Octobre 2024", montantDu: 60000, montantPaye: 60000 },
  { id: 15, tenantId: 3, date: "2024-11-05", periode: "Novembre 2024", montantDu: 60000, montantPaye: 30000 },
  { id: 16, tenantId: 3, date: "2024-12-05", periode: "Décembre 2024", montantDu: 60000, montantPaye: 60000 },
  { id: 17, tenantId: 3, date: "2025-01-05", periode: "Janvier 2025", montantDu: 60000, montantPaye: 60000 },
  { id: 18, tenantId: 3, date: "2025-02-05", periode: "Février 2025", montantDu: 60000, montantPaye: 60000 },
  { id: 19, tenantId: 3, date: "2025-03-05", periode: "Mars 2025", montantDu: 60000, montantPaye: 60000 },
  { id: 20, tenantId: 3, date: "2025-04-05", periode: "Avril 2025", montantDu: 60000, montantPaye: 60000 },
  { id: 21, tenantId: 3, date: "2025-05-05", periode: "Mai 2025", montantDu: 60000, montantPaye: 60000 },
  { id: 22, tenantId: 3, date: "2025-06-05", periode: "Juin 2025", montantDu: 60000, montantPaye: 60000 },
];
