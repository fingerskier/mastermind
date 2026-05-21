export interface Council {
  slug: string;
  name: string;
  description: string;
  template: string | null;
  created_at: string;
}

export interface Councillor {
  slug: string;
  name: string;
  role: string;
  adapter: string;
  persona: string;
  created_at: string;
}

export interface CouncilWithCouncillors extends Council {
  councillors: Councillor[];
}
