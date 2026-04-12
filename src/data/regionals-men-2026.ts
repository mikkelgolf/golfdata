export interface RegionalPreview {
  courseName?: string;
  grassType?: string;
  courseHistory?: string;
  internationalPlayers?: string;
  travelHistory?: string;
  coachMilestones?: string;
  notes?: string;
}

export interface Regional {
  id: number;
  name: string;
  host: string;
  city: string;
  lat: number;
  lng: number;
  color: string;
  preview?: RegionalPreview;
}

export const regionalsMen2026: Regional[] = [
  {
    id: 1,
    name: "Corvallis Regional",
    host: "Oregon State",
    city: "Corvallis, OR",
    lat: 44.5646,
    lng: -123.2620,
    color: "#5da89e",
  },
  {
    id: 2,
    name: "Athens Regional",
    host: "Georgia",
    city: "Athens, GA",
    lat: 33.9519,
    lng: -83.3576,
    color: "#b88585",
  },
  {
    id: 3,
    name: "Marana Regional",
    host: "Arizona",
    city: "Marana, AZ",
    lat: 32.4367,
    lng: -111.2257,
    color: "#c2a06b",
  },
  {
    id: 4,
    name: "Bermuda Run Regional",
    host: "Wake Forest",
    city: "Bermuda Run, NC",
    lat: 36.0048,
    lng: -80.4218,
    color: "#9680b0",
  },
  {
    id: 5,
    name: "Bryan Regional",
    host: "Texas A&M",
    city: "Bryan, TX",
    lat: 30.6744,
    lng: -96.3698,
    color: "#7090b5",
  },
  {
    id: 6,
    name: "Columbus Regional",
    host: "Ohio State",
    city: "Columbus, OH",
    lat: 40.0067,
    lng: -83.0305,
    color: "#78a878",
  },
];
