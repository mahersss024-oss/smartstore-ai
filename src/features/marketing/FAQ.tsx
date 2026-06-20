import { useTranslations } from 'next-intl';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Section } from '@/features/landing/Section';

export const FAQ = () => {
  const t = useTranslations('FAQ');
  const items = [1, 2, 3, 4, 5, 6] as const;

  return (
    <Section
      id="setup"
      subtitle={t('section_subtitle')}
      title={t('section_title')}
      description={t('section_description')}
    >
      <Accordion type="multiple" className="w-full">
        {items.map(item => (
          <AccordionItem key={item} value={`item-${item}`}>
            <AccordionTrigger>{t(`question_${item}`)}</AccordionTrigger>
            <AccordionContent>{t(`answer_${item}`)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
};
