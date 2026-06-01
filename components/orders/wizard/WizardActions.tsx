import { Button } from "@/components/ui/button";

/**
 * Wizard footer: Späť / Ďalej, and on the final step the submit button
 * ("Vytvoriť rezerváciu" in create mode, "Uložiť zmeny" in edit mode).
 */
export function WizardActions({
  isFirst,
  isLast,
  nextDisabled,
  pending,
  finalLabel,
  onBack,
  onNext,
  onFinish,
}: {
  isFirst: boolean;
  isLast: boolean;
  nextDisabled: boolean;
  pending: boolean;
  finalLabel: string;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="ghost" onClick={onBack} disabled={isFirst || pending}>
        Späť
      </Button>
      {isLast ? (
        <Button type="button" onClick={onFinish} disabled={nextDisabled || pending}>
          {pending ? "Ukladám…" : finalLabel}
        </Button>
      ) : (
        <Button type="button" onClick={onNext} disabled={nextDisabled || pending}>
          {pending ? "Načítavam…" : "Ďalej"}
        </Button>
      )}
    </div>
  );
}
