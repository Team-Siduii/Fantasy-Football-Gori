import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { replacePlayers } from "@/lib/player-store";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const csvTextFromField = formData.get("csvText");

    let csvContent = "";

    if (file instanceof File) {
      csvContent = await file.text();
    } else if (typeof csvTextFromField === "string" && csvTextFromField.trim().length > 0) {
      csvContent = csvTextFromField;
    } else {
      return NextResponse.json(
        { error: "Geen CSV ontvangen. Upload een .csv bestand of plak CSV-tekst." },
        { status: 400 },
      );
    }

    const { players } = parsePlayerCsv(csvContent);
    replacePlayers(players);

    return NextResponse.json({
      ok: true,
      count: players.length,
      sample: players.slice(0, 5),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende uploadfout.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
