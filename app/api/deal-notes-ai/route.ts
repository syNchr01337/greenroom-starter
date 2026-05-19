import {
  interpretDealNotesMock,
  type DealNotesAiRequest,
  type DealNotesAiResponse,
} from "@/lib/dealNotesAi";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DealNotesAiRequest;

    // TODO: If OPENAI_API_KEY is present, this can call an LLM with a strict
    // JSON schema. For the case-study build, keep a deterministic fallback so
    // settlement never depends on an external service at 2am.
    const response: DealNotesAiResponse = interpretDealNotesMock(body);

    return Response.json(response);
  } catch {
    return Response.json(
      {
        suggestedVariant: "unknown",
        suggestedGuarantee: null,
        suggestedPercentage: null,
        suggestedExpenseCap: null,
        suggestedRecoupPlacement: "unknown",
        ambiguities: [
          "Could not read the deal notes right now. You can still settle using the breakdown above.",
        ],
      } satisfies DealNotesAiResponse,
      { status: 200 },
    );
  }
}
