export interface Photo {
  id: string;
  src: string;
  title: string;
  location: string;
  description: string;
  width: number;
  height: number;
  aspectRatio: number;
  ratioLabel: string;
  dominantColor: [number, number, number];
  exif: {
    camera: string | null;
    lens: string | null;
    focalLength: string | null;
    aperture: string | null;
    shutterSpeed: string | null;
    iso: number | null;
    date: string | null;
  };
  sample: boolean;
  credit: { label: string; url: string; source?: string } | null;
  caption?: string;
  permalink?: string;
}
export const ASSET_BASE = import.meta.env.BASE_URL;
export const photoUrl = (photo: Photo) =>
  ASSET_BASE + photo.src.replace(/^\//, "");
