import { useRouter } from "next/router";
import { Song } from "@/lib/csv";
import {
  DIFFICULTY_ORDER,
  DifficultyBadge,
} from "@/components/DifficultyBadge";
import type { DifficultyKey } from "@/lib/csv";

export function SongCard({
  song,
  isEditor,
  onEdit,
}: {
  song: Song;
  isEditor?: boolean;
  onEdit?: (song: Song) => void;
}) {
  const router = useRouter();

  const goToSimulate = (difficulty: DifficultyKey) => {
    const level = song.levels[difficulty];
    if (level === null) return;
    router.push({
      pathname: "/simulate/[id]",
      query: {
        id: song.id,
        title: song.title,
        subtitle: song.subtitle,
        chartFileName: song.chartFileName,
        difficulty,
        level: String(level),
      },
    });
  };

  return (
    <div className="song-card">
      <div className="jacket">
        {song.jacketUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.jacketUrl} alt="" loading="lazy" />
        ) : (
          <div className="jacket-placeholder" />
        )}
      </div>
      <div className="title-block">
        <div className="title">
          {song.title}
          {song.subtitle && <span className="subtitle"> / {song.subtitle}</span>}
        </div>
        <div className="song-id">#{song.id}</div>
      </div>
      <div className="badges">
        {isEditor && (
          <button
            className="edit-pencil"
            title={
              song.chartFileName
                ? `${song.chartFileName} を編集`
                : "譜面ファイル未設定"
            }
            disabled={!song.chartFileName}
            onClick={() => {
              if (onEdit) onEdit(song);
            }}
          >
            ✎
          </button>
        )}
        {DIFFICULTY_ORDER.map((d) => (
          <DifficultyBadge
            key={d}
            difficulty={d}
            level={song.levels[d]}
            onClick={song.chartFileName ? goToSimulate : undefined}
          />
        ))}
      </div>
    </div>
  );
}
