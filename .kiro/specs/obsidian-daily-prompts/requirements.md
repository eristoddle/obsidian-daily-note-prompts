# Requirements Document

## Introduction

The Obsidian Daily Prompts plugin provides users with a flexible system for receiving daily writing prompts, reflections, or devotionals within their Obsidian vault. The plugin supports multiple prompt delivery modes (sequential, random, or date-based), customizable notifications, and seamless integration with daily notes. Users can import/export prompt packs in JSON format and have prompts automatically launch in zen mode for focused writing sessions.

## Requirements

### Requirement 1

**User Story:** As an Obsidian user, I want to create and manage prompt packs with different delivery modes, so that I can organize my writing prompts according to my preferred workflow.

#### Acceptance Criteria

1. WHEN a user creates a new prompt pack THEN the system SHALL allow them to specify the type as 'Sequential', 'Random', or 'Date'
2. WHEN a user adds prompts to a pack THEN the system SHALL support prompts as links, strings, or markdown content
3. WHEN a user creates a Sequential prompt pack THEN the system SHALL allow them to define the order of prompts
4. WHEN a user creates a Date-based prompt pack THEN the system SHALL allow them to assign specific dates to prompts
5. WHEN a user creates a Random prompt pack THEN the system SHALL randomly select prompts without repetition until all are used

### Requirement 2

**User Story:** As an Obsidian user, I want to import and export prompt packs in JSON format, so that I can share prompt collections with others and backup my configurations.

#### Acceptance Criteria

1. WHEN a user exports a prompt pack THEN the system SHALL generate a valid JSON file containing all prompt data, metadata, and configuration
2. WHEN a user imports a JSON prompt pack THEN the system SHALL validate the format and load all prompts with their associated settings
3. WHEN importing a prompt pack THEN the system SHALL handle conflicts with existing prompt packs by offering rename or merge options
4. WHEN exporting prompt packs THEN the system SHALL preserve all prompt types (links, strings, markdown), dates, and order information

### Requirement 3

**User Story:** As an Obsidian user, I want to receive notifications and reminders for my daily prompts, so that I maintain a consistent writing practice.

#### Acceptance Criteria

1. WHEN a user enables notifications THEN the system SHALL offer both system notifications and Obsidian-based notifications
2. WHEN a notification time is reached THEN the system SHALL display the prompt notification with options to open or dismiss
3. WHEN a user sets a reminder time THEN the system SHALL respect their timezone and schedule notifications accordingly
4. WHEN a user clicks a prompt notification THEN the system SHALL automatically open the daily note with the prompt inserted
5. IF a user misses a prompt notification THEN the system SHALL provide a way to access missed prompts

### Requirement 4

**User Story:** As an Obsidian user, I want prompts to automatically integrate with my daily notes and launch in zen mode, so that I can focus on writing without distractions.

#### Acceptance Criteria

1. WHEN a prompt is activated THEN the system SHALL automatically create or open the current day's daily note
2. WHEN a prompt is inserted into a daily note THEN the system SHALL format it appropriately based on the prompt type (link, string, or markdown)
3. WHEN a prompt is opened THEN the system SHALL automatically enable zen mode for distraction-free writing
4. WHEN handling link-type prompts THEN the system SHALL resolve and display the linked content appropriately
5. WHEN handling long markdown prompts THEN the system SHALL format them with proper spacing and readability

### Requirement 5

**User Story:** As an Obsidian user, I want to track my progress through prompt packs and manage completed prompts, so that I can see my writing journey and avoid repetition.

#### Acceptance Criteria

1. WHEN a user completes a prompt THEN the system SHALL mark it as completed and track the completion date
2. WHEN viewing a prompt pack THEN the system SHALL display progress indicators showing completed vs remaining prompts
3. WHEN all prompts in a Sequential pack are completed THEN the system SHALL offer options to restart or archive the pack
4. WHEN using Random mode THEN the system SHALL ensure no prompt repeats until all prompts in the pack have been used
5. WHEN using Date mode THEN the system SHALL handle past dates appropriately and allow catch-up sessions

### Requirement 6

**User Story:** As an Obsidian user, I want to customize prompt display and behavior settings, so that the plugin works seamlessly with my existing Obsidian workflow.

#### Acceptance Criteria

1. WHEN configuring the plugin THEN the system SHALL allow users to customize daily note template integration
2. WHEN setting up notifications THEN the system SHALL allow users to configure notification timing, frequency, and style
3. WHEN using zen mode THEN the system SHALL allow users to configure which UI elements to hide
4. WHEN prompts contain links THEN the system SHALL allow users to choose how links are handled (embed, reference, or direct link)
5. WHEN working with different prompt lengths THEN the system SHALL provide formatting options for optimal readability