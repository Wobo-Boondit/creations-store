"use client";

import { useState, useEffect } from "react";
import { Star, Trash2, Edit2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRating } from "@/components/star-rating";
import { VerifiedBadge } from "@/components/verified-badge";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date | string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    isVerified?: boolean;
  };
}

interface CreationReviewsProps {
  creationId: string;
  initialReviews: Review[];
  initialAverageRating: { average: number; count: number } | null;
  currentUser?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
  } | null;
}

export function CreationReviews({
  creationId,
  initialReviews,
  initialAverageRating,
  currentUser = null,
}: CreationReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [averageRating, setAverageRating] = useState(initialAverageRating);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Review form state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [hoveredStar, setHoveredStar] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);

  // Find user's existing review
  const userReview = currentUser
    ? reviews.find((r) => r.user.id === currentUser.id)
    : null;

  useEffect(() => {
    if (userReview && !isEditing) {
      setRating(userReview.rating);
      setComment(userReview.comment || "");
    }
  }, [userReview, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || rating === 0) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const method = "POST";
      const url = `/api/creations/${creationId}/reviews`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit review");
      }

      const data = await response.json();

      if (userReview) {
        // Update existing review in state
        setReviews((prev) =>
          prev.map((r) =>
            r.id === userReview.id
              ? { ...r, rating, comment: comment || null, updatedAt: new Date().toISOString() }
              : r
          )
        );
        setMessage({ type: "success", text: "Review updated!" });
      } else {
        // Add new review to state
        setReviews((prev) => [
          {
            ...data,
            user: {
              id: currentUser.id,
              username: currentUser.username || "User",
              avatarUrl: currentUser.avatarUrl || null,
              isVerified: currentUser.isVerified ?? false,
            },
          },
          ...prev,
        ]);
        setMessage({ type: "success", text: "Review submitted!" });
      }

      // Reset form if it was a new review
      if (!userReview) {
        setRating(0);
        setComment("");
      }

      setIsEditing(false);
      setEditingReviewId(null);

      // Refetch average rating
      const avgResponse = await fetch(`/api/creations/${creationId}/reviews`);
      if (avgResponse.ok) {
        const allReviews = await avgResponse.json();
        const avg = allReviews.reduce((sum: number, r: Review) => sum + r.rating, 0) / allReviews.length;
        setAverageRating({ average: Math.round(avg * 10) / 10, count: allReviews.length });
      }

      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error submitting review:", error);
      setMessage({ type: "error", text: "Failed to submit review" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingReviewId) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/creations/${creationId}/reviews`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete review");
      }

      setReviews((prev) => prev.filter((r) => r.id !== deletingReviewId));
      setDeleteDialogOpen(false);
      setDeletingReviewId(null);
      setMessage({ type: "success", text: "Review deleted!" });

      // Refetch average rating
      const avgResponse = await fetch(`/api/creations/${creationId}/reviews`);
      if (avgResponse.ok) {
        const allReviews = await avgResponse.json();
        if (allReviews.length > 0) {
          const avg = allReviews.reduce((sum: number, r: Review) => sum + r.rating, 0) / allReviews.length;
          setAverageRating({ average: Math.round(avg * 10) / 10, count: allReviews.length });
        } else {
          setAverageRating(null);
        }
      }

      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error deleting review:", error);
      setMessage({ type: "error", text: "Failed to delete review" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (review: Review) => {
    setIsEditing(true);
    setEditingReviewId(review.id);
    setRating(review.rating);
    setComment(review.comment || "");
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditingReviewId(null);
    if (userReview) {
      setRating(userReview.rating);
      setComment(userReview.comment || "");
    } else {
      setRating(0);
      setComment("");
    }
  };

  const formatDate = (dateString: Date | string) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Average Rating */}
      {averageRating && averageRating.count > 0 && (
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-3xl font-bold">{averageRating.average}</div>
            <div className="text-sm text-muted-foreground">
              {averageRating.count} {averageRating.count === 1 ? "review" : "reviews"}
            </div>
          </div>
          <div className="flex-1">
            <StarRating rating={averageRating.average} count={averageRating.count} size="lg" />
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          className={cn(
            "p-3 rounded-lg text-sm",
            message.type === "success"
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-500"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Review Form or Sign In Prompt */}
      {!currentUser ? (
        <div className="border rounded-lg p-6 text-center">
          <h3 className="font-semibold mb-2">Sign in to review</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You need to be signed in to leave a review for this creation.
          </p>
          <Button asChild>
            <a href="/auth/signin">
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </a>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold">
            {userReview ? "Your Review" : "Write a Review"}
          </h3>

          {(isEditing || !userReview) ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Star Rating */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Your Rating
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="p-1 hover:scale-110 transition-transform"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredStar(star)}
                      onMouseLeave={() => setHoveredStar(0)}
                    >
                      <Star
                        className={cn(
                          "h-6 w-6",
                          (hoveredStar || rating) >= star
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300 dark:text-gray-600"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Comment (optional)
                </label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your thoughts about this creation..."
                  rows={3}
                  maxLength={500}
                />
                <div className="text-xs text-muted-foreground mt-1 text-right">
                  {comment.length}/500
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button type="submit" disabled={rating === 0 || isSubmitting}>
                  {isSubmitting
                    ? "Submitting..."
                    : userReview
                      ? "Update Review"
                      : "Submit Review"}
                </Button>
                {userReview && !isEditing && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startEdit(userReview)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        setDeletingReviewId(userReview.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
                {isEditing && (
                  <Button type="button" variant="ghost" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <StarRating rating={userReview.rating} size="sm" showCount={false} />
                <span className="text-sm text-muted-foreground">
                  {formatDate(userReview.createdAt)}
                </span>
              </div>
              {userReview.comment && (
                <p className="text-sm">{userReview.comment}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(userReview)}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    setDeletingReviewId(userReview.id);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviews List */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold">
            Reviews ({reviews.length})
          </h3>
          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {review.user.avatarUrl ? (
                      <img
                        src={review.user.avatarUrl}
                        alt={review.user.username}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        {review.user.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="inline-flex items-center gap-1 font-medium text-sm">
                        {review.user.username}
                        {review.user.isVerified && <VerifiedBadge className="text-[0.9em]" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(review.createdAt)}
                      </div>
                    </div>
                  </div>
                  <StarRating rating={review.rating} size="sm" showCount={false} />
                </div>
                {review.comment && (
                  <p className="text-sm text-muted-foreground">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Reviews */}
      {reviews.length === 0 && !userReview && (
        <div className="text-center py-8 text-muted-foreground">
          No reviews yet. Be the first to review!
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Review</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your review? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingReviewId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}