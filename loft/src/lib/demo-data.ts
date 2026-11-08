// A believable Google Drive for the migration demo. 1,284 files / 14.2 GB in the copy,
// but we materialise a representative ~60 so the drive view stays readable.

export const GDRIVE_TOTAL = 1284;
export const GDRIVE_BYTES = 14.2 * 1024 ** 3;

type Seed = [folder: string, name: string, mime: string, size: number];

const seeds: Seed[] = [
  ["", "Tax return 2024.pdf", "application/pdf", 2_310_000],
  ["", "Lease agreement – 14 Elm St.pdf", "application/pdf", 1_120_000],
  ["", "Passport scan.jpg", "image/jpeg", 3_400_000],
  ["", "Budget.xlsx", "application/vnd.ms-excel", 88_000],
  ["", "Resume – Maya Chen.docx", "application/msword", 54_000],
  ["Photos/2024", "IMG_4021.HEIC", "image/heic", 4_100_000],
  ["Photos/2024", "IMG_4022.HEIC", "image/heic", 3_900_000],
  ["Photos/2024", "IMG_4038.HEIC", "image/heic", 4_400_000],
  ["Photos/2024", "Lisbon trip.mov", "video/quicktime", 480_000_000],
  ["Photos/2023", "Birthday dinner.jpg", "image/jpeg", 5_200_000],
  ["Photos/2023", "Graduation.mp4", "video/mp4", 1_210_000_000],
  ["Work", "Q3 planning.pptx", "application/vnd.ms-powerpoint", 14_500_000],
  ["Work", "Offer letter.pdf", "application/pdf", 320_000],
  ["Work", "Notes.gdoc", "application/vnd.google-apps.document", 12_000],
  ["Work/Clients", "Brightside – proposal.pdf", "application/pdf", 2_900_000],
  ["Work/Clients", "Invoice 0042.pdf", "application/pdf", 90_000],
  ["Recipes", "Grandma's jollof.pdf", "application/pdf", 410_000],
  ["Recipes", "Sourdough timing.txt", "text/plain", 2_100],
  ["School", "Thesis final.pdf", "application/pdf", 8_800_000],
  ["School", "Lecture 12.mp4", "video/mp4", 640_000_000],
  ["", "Car insurance 2025.pdf", "application/pdf", 640_000],
  ["", "Wedding guest list.xlsx", "application/vnd.ms-excel", 41_000],
  ["", "Vaccination record.jpg", "image/jpeg", 2_200_000],
  ["Photos/2024", "IMG_4051.HEIC", "image/heic", 3_700_000],
  ["Photos/2024", "IMG_4052.HEIC", "image/heic", 4_000_000],
  ["Photos/2024", "IMG_4077.HEIC", "image/heic", 3_300_000],
  ["Photos/2024", "Beach day.mp4", "video/mp4", 320_000_000],
  ["Photos/2023", "Mum's 60th.jpg", "image/jpeg", 4_900_000],
  ["Photos/2023", "Road trip.mov", "video/quicktime", 890_000_000],
  ["Photos/2022", "New flat.jpg", "image/jpeg", 3_100_000],
  ["Photos/2022", "Christmas.mp4", "video/mp4", 410_000_000],
  ["Work", "Performance review 2025.docx", "application/msword", 61_000],
  ["Work", "Team offsite photos.zip", "application/zip", 220_000_000],
  ["Work/Clients", "Northwind – contract.pdf", "application/pdf", 1_400_000],
  ["Work/Clients", "Invoice 0043.pdf", "application/pdf", 92_000],
  ["Recipes", "Pepper soup.pdf", "application/pdf", 380_000],
  ["School", "Reading list.docx", "application/msword", 28_000],
  ["Music", "Demo – first take.mp3", "audio/mpeg", 6_800_000],
  ["Music", "Lyrics.txt", "text/plain", 3_400],
];

export const gdriveFiles = seeds.map(([folder, name, mime, size]) => ({ folder, name, mime, size }));

export const phonePhotos = Array.from({ length: 24 }, (_, i) => ({
  name: `IMG_${5100 + i}.HEIC`,
  size: 3_000_000 + ((i * 7919) % 2_000_000),
  // decorative gradient so the grid looks like a camera roll without shipping images
  hue: (i * 47) % 360,
}));
