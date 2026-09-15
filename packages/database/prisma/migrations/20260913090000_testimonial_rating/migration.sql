-- A testimonial may carry the rating the person gave, shown as stars. Nullable
-- on purpose: an existing testimonial has no rating, and a default of five
-- would put a score on the page that nobody gave. Additive.
ALTER TABLE `testimonials` ADD COLUMN `rating` TINYINT NULL;
