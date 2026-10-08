// Veloria PoS — Shared: fiche entreprise (source unique côté renderer).
// Remplace les 9 blocs `companyGet` recopiés dans les écrans : même mapping,
// mêmes replis, un seul endroit à maintenir. `record` garde l'accès brut
// (rc_number/nif) pour les tickets d'impression.

import { useCallback, useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";

interface CompanyInfo {
  name: string;
  phone: string;
  address: string;
  city: string;
  email: string;
  rc: string;
  nif: string;
  /** C5 : NIS + article (mentions facture DZ). */
  nis: string;
  article: string;
}

const EMPTY_COMPANY: CompanyInfo = {
  name: "Veloria",
  phone: "",
  address: "",
  city: "",
  email: "",
  rc: "",
  nif: "",
  nis: "",
  article: "",
};

export function useCompany(): {
  company: CompanyInfo;
  record: Record<string, string> | null;
  logoDataUrl: string | null;
  reload: () => void;
} {
  const [company, setCompany] = useState<CompanyInfo>(EMPTY_COMPANY);
  const [record, setRecord] = useState<Record<string, string> | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .companyGet()
      .then((c) => {
        const res = c as {
          company: Record<string, string> | null;
          logoDataUrl?: string | null;
        };
        const co = res.company;
        setRecord(co);
        setCompany({
          name: co?.company_name ?? "Veloria",
          phone: co?.phone ?? "",
          address: co?.address ?? "",
          city: co?.city ?? "",
          email: co?.email ?? "",
          // P2 : colonne canonique = rc_number (schéma 0001). `commercial_register`
          // n'est lu qu'en repli pour les bases legacy V108 qui portent encore
          // cette colonne (SELECT * la remonte) — convergé vers rc_number au
          // premier enregistrement (company.repo écrit commercial_register → rc_number).
          rc: co?.commercial_register ?? co?.rc_number ?? "",
          nif: co?.nif ?? "",
          nis: co?.nis ?? "",
          article: co?.article_imposition ?? "",
        });
        setLogoDataUrl(typeof res.logoDataUrl === "string" ? res.logoDataUrl : null);
      })
      .catch(() => {
        setRecord(null);
        setCompany(EMPTY_COMPANY);
        setLogoDataUrl(null);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { company, record, logoDataUrl, reload };
}
