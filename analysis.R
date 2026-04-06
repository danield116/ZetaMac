# ============================================================
# MIE 286 Final Report R Script
# Topic: Effect of Gain vs. Loss Feedback on Task Performance
# Data file: mie_zetamac_data.csv
# NOTE: This version is designed for your aggregated participant CSV
#       with columns:
#       condition, participant_id, Count of user_answer, Sum of is_correct
#       and blank condition cells from spreadsheet merged rows.
# No packages required (base R only).
# ============================================================

# ----------------------------
# 1. Import data
# ----------------------------
raw_data <- read.csv(
  "mie_zetamac_data.csv",
  stringsAsFactors = FALSE,
  skip = 2,
  check.names = FALSE
)
names(raw_data) <- trimws(names(raw_data))

cat("Imported columns:\n")
print(names(raw_data))

# ----------------------------
# 2. Clean and format variables
# ----------------------------
# Fill down condition values (for merged-cell style exports).
raw_data$condition <- tolower(trimws(as.character(raw_data$condition)))
for (i in seq_along(raw_data$condition)) {
  if ((is.na(raw_data$condition[i]) || raw_data$condition[i] == "") && i > 1) {
    raw_data$condition[i] <- raw_data$condition[i - 1]
  }
}

raw_data$participant_id <- trimws(as.character(raw_data$participant_id))
raw_data$questions_attempted <- as.numeric(raw_data$`Count of user_answer`)
raw_data$num_correct <- as.numeric(raw_data$`Sum of is_correct`)

# Keep participant rows only (drop totals rows).
data_clean <- raw_data[grepl("^P-", raw_data$participant_id), ]

# Keep only gain/loss.
data_clean <- data_clean[data_clean$condition %in% c("gain", "loss"), ]

# Remove missing numeric rows.
data_clean <- data_clean[!is.na(data_clean$questions_attempted) &
                         !is.na(data_clean$num_correct), ]

# Core metrics.
data_clean$accuracy <- data_clean$num_correct / data_clean$questions_attempted
data_clean$speed_q_per_s <- data_clean$questions_attempted / 120
data_clean$speed_q_per_min <- data_clean$questions_attempted / 2
data_clean$condition <- factor(data_clean$condition, levels = c("gain", "loss"))

cat("\nNumber of participant rows:", nrow(data_clean), "\n")
cat("Number of unique participants:", length(unique(data_clean$participant_id)), "\n")
cat("Participants by condition:\n")
print(table(data_clean$condition))

# This CSV has no item-level response times, so keep NA placeholders.
data_clean$mean_response_time_ms <- NA_real_
data_clean$median_response_time_ms <- NA_real_

# ----------------------------
# 3. Participant-level dataset
# ----------------------------
# Already participant-level, but keep structure expected by later sections.
participant_data <- data_clean[, c(
  "participant_id", "condition", "questions_attempted", "num_correct",
  "accuracy", "speed_q_per_s", "speed_q_per_min",
  "mean_response_time_ms", "median_response_time_ms"
)]

cat("\nParticipant-level dataset:\n")
print(participant_data)

write.csv(participant_data, "participant_level_data.csv", row.names = FALSE)

# ----------------------------
# 4. Descriptive statistics by condition
# ----------------------------
conditions <- levels(participant_data$condition)

desc_stats <- data.frame(
  condition = character(),
  n = numeric(),
  mean_attempted = numeric(),
  sd_attempted = numeric(),
  median_attempted = numeric(),
  min_attempted = numeric(),
  max_attempted = numeric(),
  mean_accuracy = numeric(),
  sd_accuracy = numeric(),
  median_accuracy = numeric(),
  min_accuracy = numeric(),
  max_accuracy = numeric(),
  mean_correct = numeric(),
  sd_correct = numeric(),
  mean_rt_ms = numeric(),
  sd_rt_ms = numeric(),
  stringsAsFactors = FALSE
)

for (cond in conditions) {
  sub <- participant_data[participant_data$condition == cond, ]
  desc_stats <- rbind(
    desc_stats,
    data.frame(
      condition = cond,
      n = nrow(sub),
      mean_attempted = mean(sub$questions_attempted),
      sd_attempted = sd(sub$questions_attempted),
      median_attempted = median(sub$questions_attempted),
      min_attempted = min(sub$questions_attempted),
      max_attempted = max(sub$questions_attempted),
      mean_accuracy = mean(sub$accuracy),
      sd_accuracy = sd(sub$accuracy),
      median_accuracy = median(sub$accuracy),
      min_accuracy = min(sub$accuracy),
      max_accuracy = max(sub$accuracy),
      mean_correct = mean(sub$num_correct),
      sd_correct = sd(sub$num_correct),
      mean_rt_ms = NA_real_,
      sd_rt_ms = NA_real_,
      stringsAsFactors = FALSE
    )
  )
}

cat("\nDescriptive statistics by condition:\n")
print(desc_stats)
write.csv(desc_stats, "descriptive_statistics_by_condition.csv", row.names = FALSE)

# ----------------------------
# 5. Figure 1: Speed by condition
# ----------------------------
png("Figure1_Speed_by_Condition.png", width = 900, height = 700)
boxplot(
  questions_attempted ~ condition,
  data = participant_data,
  main = "Speed by Feedback Condition",
  xlab = "Feedback Condition",
  ylab = "Questions Attempted in 120 Seconds",
  col = c("lightblue", "mistyrose")
)
stripchart(
  questions_attempted ~ condition,
  data = participant_data,
  vertical = TRUE,
  method = "jitter",
  pch = 19,
  add = TRUE
)
dev.off()

# ----------------------------
# 6. Figure 2: Accuracy by condition
# ----------------------------
png("Figure2_Accuracy_by_Condition.png", width = 900, height = 700)
boxplot(
  accuracy ~ condition,
  data = participant_data,
  main = "Accuracy by Feedback Condition",
  xlab = "Feedback Condition",
  ylab = "Proportion Correct",
  col = c("lightblue", "mistyrose")
)
stripchart(
  accuracy ~ condition,
  data = participant_data,
  vertical = TRUE,
  method = "jitter",
  pch = 19,
  add = TRUE
)
dev.off()

# ----------------------------
# 7. Figure 3: Speed-accuracy relationship
# ----------------------------
png("Figure3_Speed_Accuracy_Relationship.png", width = 900, height = 700)
plot(
  participant_data$questions_attempted,
  participant_data$accuracy,
  col = ifelse(participant_data$condition == "gain", "blue", "red"),
  pch = 19,
  xlab = "Questions Attempted in 120 Seconds",
  ylab = "Proportion Correct",
  main = "Speed-Accuracy Relationship by Feedback Condition"
)
legend("bottomright", legend = c("Gain", "Loss"), col = c("blue", "red"), pch = 19)
abline(lm(accuracy ~ questions_attempted, data = participant_data), lty = 2)
dev.off()

# ----------------------------
# 8. Appendix histograms
# ----------------------------
png("Appendix_Figure_Speed_Histograms.png", width = 900, height = 900)
par(mfrow = c(2, 1))
hist(
  participant_data$questions_attempted[participant_data$condition == "gain"],
  main = "Speed Distribution: Gain",
  xlab = "Questions Attempted",
  col = "lightblue",
  breaks = 8
)
hist(
  participant_data$questions_attempted[participant_data$condition == "loss"],
  main = "Speed Distribution: Loss",
  xlab = "Questions Attempted",
  col = "mistyrose",
  breaks = 8
)
dev.off()

png("Appendix_Figure_Accuracy_Histograms.png", width = 900, height = 900)
par(mfrow = c(2, 1))
hist(
  participant_data$accuracy[participant_data$condition == "gain"],
  main = "Accuracy Distribution: Gain",
  xlab = "Proportion Correct",
  col = "lightblue",
  breaks = 8
)
hist(
  participant_data$accuracy[participant_data$condition == "loss"],
  main = "Accuracy Distribution: Loss",
  xlab = "Proportion Correct",
  col = "mistyrose",
  breaks = 8
)
dev.off()
par(mfrow = c(1, 1))

# ----------------------------
# 9. Assumption checks
# ----------------------------
cat("\n=============================\n")
cat("ASSUMPTION CHECKS\n")
cat("=============================\n")

cat("\nShapiro-Wilk tests for speed:\n")
print(by(participant_data$questions_attempted, participant_data$condition, shapiro.test))

cat("\nShapiro-Wilk tests for accuracy:\n")
print(by(participant_data$accuracy, participant_data$condition, shapiro.test))

cat("\n--- Summary (Shapiro-Wilk p-values) ---\n")
sh_speed <- by(participant_data$questions_attempted, participant_data$condition, shapiro.test)
sh_acc <- by(participant_data$accuracy, participant_data$condition, shapiro.test)
print(
  data.frame(
    condition = names(sh_speed),
    shapiro_p_speed = sapply(sh_speed, function(x) x$p.value),
    shapiro_p_accuracy = sapply(sh_acc, function(x) x$p.value),
    row.names = NULL
  )
)

levene_median_test <- function(y, group) {
  group <- as.factor(group)
  med <- tapply(y, group, median, na.rm = TRUE)
  z <- abs(y - med[group])
  fit <- aov(z ~ group)
  p <- summary(fit)[[1]][["Pr(>F)"]][1]
  list(p.value = p, aov = fit)
}

cat("\nLevene (median-centered) tests for equal variances:\n")
lv_speed <- levene_median_test(participant_data$questions_attempted, participant_data$condition)
lv_acc <- levene_median_test(participant_data$accuracy, participant_data$condition)
cat("Speed (questions_attempted): p =", lv_speed$p.value, "\n")
cat("Accuracy: p =", lv_acc$p.value, "\n")

png("Appendix_QQplot_Speed_Gain.png", width = 900, height = 700)
qqnorm(
  participant_data$questions_attempted[participant_data$condition == "gain"],
  main = "Q-Q Plot: Speed (Gain)"
)
qqline(participant_data$questions_attempted[participant_data$condition == "gain"])
dev.off()

png("Appendix_QQplot_Speed_Loss.png", width = 900, height = 700)
qqnorm(
  participant_data$questions_attempted[participant_data$condition == "loss"],
  main = "Q-Q Plot: Speed (Loss)"
)
qqline(participant_data$questions_attempted[participant_data$condition == "loss"])
dev.off()

png("Appendix_QQplot_Accuracy_Gain.png", width = 900, height = 700)
qqnorm(
  participant_data$accuracy[participant_data$condition == "gain"],
  main = "Q-Q Plot: Accuracy (Gain)"
)
qqline(participant_data$accuracy[participant_data$condition == "gain"])
dev.off()

png("Appendix_QQplot_Accuracy_Loss.png", width = 900, height = 700)
qqnorm(
  participant_data$accuracy[participant_data$condition == "loss"],
  main = "Q-Q Plot: Accuracy (Loss)"
)
qqline(participant_data$accuracy[participant_data$condition == "loss"])
dev.off()

# ----------------------------
# 10. Inferential tests
# ----------------------------
cat("\n=============================\n")
cat("INFERENTIAL TESTS\n")
cat("=============================\n")

cat("\nHypotheses (two-tailed):\n")
cat("Speed (questions_attempted):\n")
cat("  H0: mean/median speed is equal between gain and loss conditions.\n")
cat("  HA: mean/median speed differs between gain and loss conditions.\n")
cat("Accuracy (proportion correct):\n")
cat("  H0: mean/median accuracy is equal between gain and loss conditions.\n")
cat("  HA: mean/median accuracy differs between gain and loss conditions.\n")
cat("Note: Welch tests compare means; Mann-Whitney compares central tendency/ranks.\n")

# Automatic decision rule based on Shapiro-Wilk:
# if BOTH condition groups have p > 0.05, use Welch t-test as primary;
# otherwise use Mann-Whitney as primary.
normal_speed <- all(sapply(sh_speed, function(x) x$p.value > 0.05))
normal_accuracy <- all(sapply(sh_acc, function(x) x$p.value > 0.05))

cat("\n--- Recommended tests (auto-selected from normality checks) ---\n")
cat("Speed recommended test:",
    ifelse(normal_speed, "Welch t-test (approximately normal)", "Mann-Whitney (non-normal)"),
    "\n")
cat("Accuracy recommended test:",
    ifelse(normal_accuracy, "Welch t-test (approximately normal)", "Mann-Whitney (non-normal)"),
    "\n")

# Speed tests
if (normal_speed) {
  cat("\nPrimary test for speed: Welch t-test\n")
  primary_speed <- t.test(questions_attempted ~ condition, data = participant_data)
} else {
  cat("\nPrimary test for speed: Mann-Whitney\n")
  primary_speed <- wilcox.test(questions_attempted ~ condition, data = participant_data, exact = FALSE)
}
print(primary_speed)

# Accuracy tests
if (normal_accuracy) {
  cat("\nPrimary test for accuracy: Welch t-test\n")
  primary_accuracy <- t.test(accuracy ~ condition, data = participant_data)
} else {
  cat("\nPrimary test for accuracy: Mann-Whitney\n")
  primary_accuracy <- wilcox.test(accuracy ~ condition, data = participant_data, exact = FALSE)
}
print(primary_accuracy)

# Also print the alternate tests for transparency.
cat("\nAlternate test for speed (for robustness):\n")
if (normal_speed) {
  alt_speed <- wilcox.test(questions_attempted ~ condition, data = participant_data, exact = FALSE)
} else {
  alt_speed <- t.test(questions_attempted ~ condition, data = participant_data)
}
print(alt_speed)

cat("\nAlternate test for accuracy (for robustness):\n")
if (normal_accuracy) {
  alt_accuracy <- wilcox.test(accuracy ~ condition, data = participant_data, exact = FALSE)
} else {
  alt_accuracy <- t.test(accuracy ~ condition, data = participant_data)
}
print(alt_accuracy)

# ----------------------------
# 11. Speed-accuracy correlations
# ----------------------------
cat("\n=============================\n")
cat("SPEED-ACCURACY CORRELATION\n")
cat("=============================\n")

cat("\nPearson correlation across all participants\n")
cor_all_pearson <- cor.test(participant_data$questions_attempted, participant_data$accuracy, method = "pearson")
print(cor_all_pearson)

cat("\nSpearman correlation across all participants\n")
cor_all_spearman <- cor.test(participant_data$questions_attempted, participant_data$accuracy, method = "spearman")
print(cor_all_spearman)

cat("\nPearson correlation for gain condition\n")
gain_data <- participant_data[participant_data$condition == "gain", ]
cor_gain <- cor.test(gain_data$questions_attempted, gain_data$accuracy, method = "pearson")
print(cor_gain)

cat("\nPearson correlation for loss condition\n")
loss_data <- participant_data[participant_data$condition == "loss", ]
cor_loss <- cor.test(loss_data$questions_attempted, loss_data$accuracy, method = "pearson")
print(cor_loss)

# ----------------------------
# 12. Optional operation analysis
# ----------------------------
cat("\nOperation-level analysis skipped: current CSV is participant-level aggregate and has no operation column.\n")

# ----------------------------
# 13. Done
# ----------------------------
cat("\nAnalysis complete. Files saved to working directory.\n")